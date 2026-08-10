import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ClipboardList,
  GraduationCap,
  HelpCircle,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTutorial } from "@/components/lumin/WelcomeTutorial";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function AccountMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdminStatus();
  const { open: openTutorial } = useTutorial();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta["full_name"] || meta["name"] || user.email || "Account";
  const avatarUrl = meta["avatar_url"] || meta["picture"];
  const initial = name.charAt(0).toUpperCase();

  async function handleSignOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Avatar className="h-9 w-9 border border-border/70 shadow-glow transition-transform duration-200 hover:scale-105">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback className="bg-gradient-lumin text-sm font-semibold text-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 border-border/70 bg-card/95 backdrop-blur-sm"
      >
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        {user.email && (
          <p className="truncate px-2 pb-1.5 text-xs text-muted-foreground">{user.email}</p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link to="/tasks">
            <ClipboardList className="h-4 w-4" aria-hidden />
            Tasks
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link to="/schedule">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Schedule
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link to="/classroom">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Classroom
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link to="/grades">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Grades
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link to="/chat">
            <Sparkles className="h-4 w-4" aria-hidden />
            Lumin AI
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem asChild className="cursor-pointer gap-2">
            <Link to="/admin">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Admin dashboard
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link to="/account">
            <Settings className="h-4 w-4" aria-hidden />
            Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={openTutorial} className="cursor-pointer gap-2">
          <HelpCircle className="h-4 w-4" aria-hidden />
          Take the tour
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void handleSignOut()}
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
