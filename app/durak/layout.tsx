import { DurakBodyReset } from "./DurakBodyReset";

export default function DurakLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DurakBodyReset />
      {children}
    </>
  );
}
