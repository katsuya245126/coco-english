import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listAssignableClassesForTeacher } from "@/server/mission/assign-service";
import { listMissionsForTeacher } from "@/server/mission/mission-service";
import { MissionList } from "@/components/teacher/MissionList";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const profile = await requireTeacherProfile();
  const [missions, assignableClasses] = await Promise.all([
    listMissionsForTeacher({ teacherId: profile.id }),
    listAssignableClassesForTeacher({ teacherId: profile.id }),
  ]);

  return (
    <div style={mainStyle}>
      <MissionList missions={missions} assignableClasses={assignableClasses} />
    </div>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: 32,
};
