import type { ProjectView } from "../projectController.js";
import { LibraryPage } from "./LibraryPage.js";
import { PublishPage } from "./PublishPage.js";
import { RoutingPage } from "./RoutingPage.js";

export function WorkspaceRouter({ view }: { view: ProjectView }) {
  if (view === "library") return <LibraryPage />;
  if (view === "publish") return <PublishPage />;
  return <RoutingPage />;
}
