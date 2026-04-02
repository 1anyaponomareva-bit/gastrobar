import { DurakBodyReset } from "./DurakBodyReset";

/** До React: фон/атрибут без ожидания эффекта — если CSS не приехал, тело всё равно не «чёрное на чёрном». */
const DURAK_ROUTE_BOOT =
  "document.documentElement.setAttribute('data-durak-route','1');" +
  "try{document.body.style.backgroundColor='#14100c';document.body.style.color='#f1f5f9';}catch(e){}";

export default function DurakLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#14100c",
        color: "#f1f5f9",
      }}
    >
      <script dangerouslySetInnerHTML={{ __html: DURAK_ROUTE_BOOT }} />
      <DurakBodyReset />
      {children}
    </div>
  );
}
