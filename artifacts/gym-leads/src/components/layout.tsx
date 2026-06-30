import React from "react";
import { Link, useLocation } from "wouter";
import { Users, Plus, Menu, CalendarClock, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/leads", label: "Leads Pipeline", icon: Users },
    { href: "/sequences", label: "Sequences", icon: CalendarClock },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-5 pb-4">
        <Link href="/" className="flex items-center">
          <img
            src="/flow-state-logo.png"
            alt="Flow State"
            className="h-10 w-auto object-contain border-t-[5px] border-b-[5px] border-l-[5px] pr-[50px] border-r-[5px]"
          />
        </Link>
      </div>

      <div className="px-4 pb-4">
        <Button asChild className="w-full justify-start gap-2 shadow-md" size="lg">
          <Link href="/leads/new">
            <Plus className="w-5 h-5" />
            Add New Lead
          </Link>
        </Button>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border border-primary/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-xs">
            FS
          </div>
          <div className="text-sm">
            <div className="font-semibold text-sidebar-foreground">Flow State</div>
            <div className="text-muted-foreground text-xs">Sales Manager</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50">
        <SidebarContent />
      </aside>

      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-sidebar">
          <Link href="/">
            <img
              src="/flow-state-logo.png"
              alt="Flow State"
              className="h-7 w-auto object-contain"
            />
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden text-foreground">
                <Menu className="w-6 h-6" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
