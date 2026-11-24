import { Nav, type NavItem } from "@/components/nav";
import { requireUser } from "@/lib/auth/dal";
import { ROLE_LABEL } from "@/lib/labels";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const items: NavItem[] = [
    { href: "/", label: "대시보드" },
    { href: "/customers", label: "고객" },
    { href: "/properties", label: "물건" },
    { href: "/tasks", label: "할 일" },
  ];
  if (user.role === "admin") {
    items.push({ href: "/admin/users", label: "직원 관리" }, { href: "/admin/audit", label: "감사 로그" });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-slate-900 p-4 md:w-56 md:shrink-0">
        <div className="mb-4 flex items-center justify-between md:block">
          <p className="text-base font-semibold text-white">마루 중개</p>
          <div className="text-xs text-slate-400 md:mt-1">
            {user.name} · {ROLE_LABEL[user.role]}
          </div>
        </div>
        <Nav items={items} />
        <form action={logout} className="mt-4">
          <button className="text-xs text-slate-400 hover:text-white">로그아웃</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
