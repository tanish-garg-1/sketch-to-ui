import { connection } from "next/server";
import { StudioLoader } from "@/components/StudioLoader";
import { aiEnabled } from "@/lib/aiGenerate";

export default async function Home() {
  await connection();
  return <StudioLoader aiEnabled={aiEnabled()} />;
}
