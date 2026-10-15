import { headers } from "next/headers";
import { cache } from "react";
import { TEACHER_PATH_HEADER, TEACHER_ROUTE_PREFIX } from "@/lib/teacher-host";

/**
 * Prefix for teacher-site links and redirects: "" on teacher.nanugo.app, and
 * "/teacher" when development serves the site at localhost:3000/teacher.
 */
export const teacherBase = cache(async (): Promise<string> =>
  (await headers()).get(TEACHER_PATH_HEADER) === "1" ? TEACHER_ROUTE_PREFIX : "",
);
