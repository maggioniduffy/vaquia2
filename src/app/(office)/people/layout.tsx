import type { ReactNode } from "react";
import { PeopleTabs } from "./people-tabs";

export default function PeopleLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PeopleTabs />
      {children}
    </>
  );
}
