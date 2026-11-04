import { PageLoader } from "@/components/common/Loader";

/** Shown by Next.js while a dashboard page is being loaded (route change). */
export default function Loading() {
  return <PageLoader label="Loading…" minHeight="60vh" />;
}
