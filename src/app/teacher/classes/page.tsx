import { ClassCreateForm } from "@/components/teacher/ClassCreateForm";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";

export const dynamic = "force-dynamic";

export default async function CreateClassPage() {
  await requireTeacherProfile();

  return (
    <section className="class-review-workspace">
      <div className="class-review-header">
        <div>
          <p className="class-review-eyebrow">Classes</p>
          <h1>Create class</h1>
        </div>
      </div>
      <ClassCreateForm />
    </section>
  );
}
