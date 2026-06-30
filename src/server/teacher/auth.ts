/**
 * Re-export of requireTeacherProfile for the teacher evidence module subtree.
 * Centralising the import path lets tests mock `@/server/teacher/auth` uniformly.
 */
export { requireTeacherProfile } from "@/server/auth/teacher-profile";
