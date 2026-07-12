import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import HomeClient from "./HomeClient";

const DEFAULT_DATABASE_IDS = {
  schedule: "38fa15fd-a3c1-80fa-a200-d99ac64b3409",
  todo: "38fa15fd-a3c1-80bd-98d9-ddcfe8406a93",
} as const;

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    redirect("/login");
  }

  return (
    <HomeClient
      scheduleDatabaseId={DEFAULT_DATABASE_IDS.schedule}
      todoDatabaseId={DEFAULT_DATABASE_IDS.todo}
      scheduleUnresolved={false}
      todoUnresolved={false}
    />
  );
}
