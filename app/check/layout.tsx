export default function CheckLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="fixed inset-0 z-[1] overflow-hidden bg-[#f2f2f2]">
      {children}
    </div>
  );
}
