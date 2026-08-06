import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listAssignableClassesForTeacher } from "@/server/mission/assign-service";
import { listMissionsForTeacher } from "@/server/mission/mission-service";
import { MissionList } from "@/components/teacher/MissionList";
import { FlashNotice } from "@/components/ui/FlashNotice";

export const dynamic = "force-dynamic";

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const [query, profile] = await Promise.all([
    searchParams,
    requireTeacherProfile(),
  ]);
  const [missions, assignableClasses] = await Promise.all([
    listMissionsForTeacher({ teacherId: profile.id }),
    listAssignableClassesForTeacher({ teacherId: profile.id }),
  ]);

  return (
    <div style={mainStyle}>
      {query.saved === "1" ? (
        <div style={toastContainer}>
          <FlashNotice message="Mission saved" />
        </div>
      ) : null}
      <MissionList missions={missions} assignableClasses={assignableClasses} />
    </div>
  );
}

const toastContainer: React.CSSProperties = {
  position: "fixed",
  top: 24,
  right: 24,
  zIndex: 1000,
};

const mainStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: 32,
};
