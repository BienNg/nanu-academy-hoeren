"use server";

import { revalidatePath, updateTag } from "next/cache";
import { auth } from "@/auth";
import {
  ADMIN_DUELS_TAG,
  ADMIN_LISTENING_RUNS_TAG,
  ADMIN_USER_PROGRESS_TAG,
} from "@/lib/admin-list-cache";
import { deleteUserAccount, isProgressStoreConfigured } from "@/lib/progress-store";

export async function deleteOwnAccount(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const userId = (await auth())?.user?.id;
  if (!userId) return { ok: false, error: "Bạn cần đăng nhập lại." };
  if (!isProgressStoreConfigured()) {
    return { ok: false, error: "Không xóa được tài khoản lúc này." };
  }

  try {
    await deleteUserAccount(userId);
  } catch (error) {
    console.error("deleteOwnAccount", error);
    return { ok: false, error: "Không xóa được tài khoản. Thử lại sau một lúc." };
  }

  revalidatePath("/admin", "layout");
  updateTag(ADMIN_USER_PROGRESS_TAG);
  updateTag(ADMIN_DUELS_TAG);
  updateTag(ADMIN_LISTENING_RUNS_TAG);
  return { ok: true };
}
