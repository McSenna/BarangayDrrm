import AppShell from "./shell/AppShell.jsx";

/** Layout for every signed-in page (routes in App.jsx). */
export default function DashboardLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
