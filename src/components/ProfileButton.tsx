"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";

export function ProfileButton() {
  const { data: session } = useSession();
  const [failed, setFailed] = useState(false);
  const image = session?.user?.image;
  const showImage = Boolean(image) && !failed;

  return (
    <Link
      href="/account"
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/[0.05] bg-[#f5f5f7] text-[#86868b] transition-all hover:scale-105 hover:opacity-90 active:scale-95"
      aria-label="Tài khoản"
    >
      {showImage && image ? (
        <Image
          src={image}
          alt=""
          width={36}
          height={36}
          referrerPolicy="no-referrer"
          className="h-9 w-9 object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          person
        </span>
      )}
    </Link>
  );
}
