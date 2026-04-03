import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { HEADER_OFFSET_TOP_DURAK } from "@/components/durak/durakLayoutConstants";
import { DurakShell } from "./DurakShell";

function pickStol(searchParams: Record<string, string | string[] | undefined>): string | undefined {
  const raw = searchParams.stol;
  if (typeof raw === "string") return raw.trim() || undefined;
  if (Array.isArray(raw)) {
    const t = raw[0]?.trim();
    return t || undefined;
  }
  return undefined;
}

/** Ссылка с ?stol= — приглашение за стол; превью не про «бота», а про приглашение. */
export async function generateMetadata(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const stol = pickStol(searchParams);

  if (stol) {
    return {
      title: "Вас приглашают в игру — GASTROBAR",
      description:
        "Вас зовут за стол в подкидного дурака в GASTROBAR. Откройте ссылку, чтобы присоединиться к партии.",
      openGraph: {
        title: "Вас приглашают в игру",
        description:
          "Вас зовут за стол в подкидного дурака. Нажмите, чтобы зайти в партию.",
      },
    };
  }

  return {
    title: "Дурак — GASTROBAR",
    description: "Подкидной дурак онлайн: за столом с друзьями или быстрый подбор игроков.",
    openGraph: {
      title: "Подкидной дурак — GASTROBAR",
      description: "Играйте онлайн в GASTROBAR: стол с друзьями или быстрая партия.",
    },
  };
}

const durakPageShellStyle: React.CSSProperties = {
  position: "relative",
  isolation: "isolate",
  zIndex: 0,
  display: "flex",
  minHeight: "100vh",
  width: "100%",
  flexDirection: "column",
  backgroundColor: "#14100c",
  color: "#f1f5f9",
};

const durakMainColumnStyle: CSSProperties = {
  display: "flex",
  minHeight: "calc(100vh - 5rem)",
  width: "100%",
  minWidth: 0,
  flex: 1,
  flexDirection: "column",
  overflowX: "hidden",
  paddingTop: "calc(60px + max(0px, env(safe-area-inset-top, 0px)) + 1rem)",
  backgroundColor: "#14100c",
  color: "#f1f5f9",
};

export default function DurakPage() {
  return (
    <div
      className={`relative isolate z-0 flex min-h-[100dvh] min-h-[100svh] w-full flex-col bg-[#14100c] text-white`}
      style={durakPageShellStyle}
    >
      <Header />
      <div
        className={`durak-page flex min-h-[calc(100svh-5rem)] w-full min-w-0 flex-1 flex-col overflow-x-hidden ${HEADER_OFFSET_TOP_DURAK}`}
        style={durakMainColumnStyle}
      >
        <DurakShell />
      </div>
      <BottomNav />
    </div>
  );
}
