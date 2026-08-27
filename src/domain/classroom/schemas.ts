import { z } from "zod";

// Teacher signup: display name, email, password, confirm password.
// Password format errors state what to fix (D-16 spirit: format errors are
// specific; account-existence errors stay generic and are surfaced server-side).
export const signupSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Enter a display name.")
      .max(80, "Display name is too long."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Password is too long."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type SignupInput = z.infer<typeof signupSchema>;

// Teacher login: email + password.
export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginInput = z.infer<typeof loginSchema>;

// First-login profile bootstrap: display name only (D-04 keeps profile minimal).
export const teacherProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(80, "Display name is too long."),
});

export type TeacherProfileInput = z.infer<typeof teacherProfileSchema>;

// Class creation: name only (CLASS-01). Join code is generated server-side and
// is never client-supplied (it is a system-owned class locator).
export const createClassSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a class name.")
    .max(80, "Class name is too long."),
});

// Class rename: target class id + new name. Ownership is enforced by RLS plus
// the server-side requireTeacherProfile guard, not by trusting this input.
export const updateClassSchema = z.object({
  classId: z.string().uuid("Invalid class reference."),
  name: z
    .string()
    .trim()
    .min(1, "Enter a class name.")
    .max(80, "Class name is too long."),
});
