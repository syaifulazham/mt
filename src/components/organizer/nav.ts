// Organizer navigation — shared by the sidebar and the /organizer home page,
// so a menu item added here shows up in both.
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Trophy,
  UserCheck,
  Gavel,
  Database,
  DatabaseBackup,
  BotMessageSquare,
  BookMarked,
  Globe,
  Images,
  Newspaper,
  Megaphone,
  Map,
  Building2,
  ShieldAlert,
  Mail,
  Send,
  Users2,
  FileBadge,
  BadgeCheck,
  GraduationCap,
} from "lucide-react";
import type { OrganizerRole } from "@/types";

export type NavSubItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
};

export type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
  roles?: OrganizerRole[];
  phase2?: boolean;
  children?: NavSubItem[];
};

export const ORGANIZER_NAV: NavItem[] = [
  {
    label: "Dashboard", href: "/organizer/dashboard", icon: LayoutDashboard,
    description: "Registration and participation figures at national, state and zone level.",
  },
  {
    label: "Staff", href: "/organizer/users", icon: Users, roles: ["SUPER_ADMIN", "ADMIN"],
    description: "Invite organizer staff, assign roles and manage their access.",
  },
  {
    label: "Reference Data", href: "/organizer/reference-data", icon: Database, roles: ["SUPER_ADMIN", "ADMIN"],
    description: "Geography, schools, higher institutions, target groups and themes.",
  },
  {
    label: "Competitions", href: "/organizer/competitions", icon: Trophy,
    description: "Set up competitions, their categories, rules and eligibility.",
  },
  {
    label: "Workshops", href: "/organizer/workshops", icon: GraduationCap,
    description: "EptimEdu courses linked to competitions, with registered participants by state, school, ethnicity, gender and target group.",
  },
  {
    label: "Contingents", href: "/organizer/contingents", icon: Building2,
    description: "Browse contingents from schools, institutions and independent groups.",
  },
  {
    label: "Participation", href: "/organizer/participation", icon: UserCheck,
    description: "Participants, managers, teams and contingents registered this season.",
  },
  {
    label: "Events", href: "/organizer/events", icon: CalendarDays,
    description: "Plan and run events — competitions, attendance, walk-ins and monitoring.",
  },
  {
    label: "Judging", href: "/organizer/judging", icon: Gavel,
    description: "Judging templates, scoring criteria and result verification.",
  },
  {
    label: "Certificates", href: "/organizer/certificates", icon: FileBadge,
    description: "Design certificate templates and look up issued certificates.",
    children: [
      { label: "Templates", href: "/organizer/certificates", icon: FileBadge,
        description: "Edit and publish certificate layouts." },
      { label: "Issued", href: "/organizer/certificates/issued", icon: BadgeCheck,
        description: "Search, download and verify issued certificates." },
    ],
  },
  {
    label: "Landing Page", href: "/organizer/landing", icon: Globe,
    description: "Content shown on the public Techlympics website.",
    children: [
      { label: "Galleries", href: "/organizer/landing/galleries", icon: Images,
        description: "Photo galleries for the public site." },
      { label: "News", href: "/organizer/landing/news", icon: Newspaper,
        description: "Publish news articles." },
      { label: "Announcements", href: "/organizer/landing/announcements", icon: Megaphone,
        description: "Post announcements to participants." },
      { label: "Competition Mapping", href: "/organizer/landing/mapping", icon: Map,
        description: "Map competitions to target groups for the public listing." },
    ],
  },
  {
    label: "Email", href: "/organizer/email", icon: Mail, roles: ["SUPER_ADMIN", "ADMIN"],
    description: "Send test and bulk emails to participants and managers.",
    children: [
      { label: "Test", href: "/organizer/email/test", icon: Send,
        description: "Send a test email to check delivery." },
      { label: "Bulk Send", href: "/organizer/email/bulk", icon: Users2,
        description: "Email a filtered group of recipients." },
    ],
  },
  {
    label: "Smart Chat", href: "/organizer/smart-chat", icon: BotMessageSquare,
    description: "Ask the assistant to find or update participant records.",
  },
  {
    label: "Knowledge Base", href: "/organizer/knowledge-base", icon: BookMarked,
    description: "Guides and reference articles for organizers.",
  },
  {
    label: "DB Backups", href: "/organizer/backups", icon: DatabaseBackup, roles: ["SUPER_ADMIN"],
    description: "Create, download and restore database backups.",
  },
  {
    label: "Data Watch", href: "/organizer/data-watch", icon: ShieldAlert, roles: ["SUPER_ADMIN", "ADMIN"],
    description: "Monitor data-quality issues and application error logs.",
  },
];

/** Menu items visible to a role (VIEWER only gets the dashboard). */
export function navForRole(role: OrganizerRole): NavItem[] {
  return ORGANIZER_NAV.filter((item) =>
    role === "VIEWER"
      ? item.href === "/organizer/dashboard"
      : !item.roles || item.roles.includes(role),
  );
}
