import {
  ArrowRight, ArrowUpRight, ChevronRight, ExternalLink, Download, FileText, CalendarDays, Clock, MapPin, Phone, Mail,
  MessageCircle, Send, UserPlus, Users, LogIn, Trophy, Medal, Award, Star, Rocket, Play, Video, Image, Camera, BookOpen,
  GraduationCap, School, Info, CircleHelp, Search, Globe, Link, Ticket, Gift, Heart, Bell, Megaphone, Newspaper,
  ShoppingCart, Cpu, Bot, Code, Gamepad2, Sparkles, CircleCheck, House, Facebook, Instagram, Youtube, Twitter, Linkedin,
  ClipboardList, Map, Building2, Handshake, Lightbulb, Zap, Flag, QrCode, Smartphone, Printer, Share2, ThumbsUp, Target,
  PenLine, BadgeCheck, type LucideIcon,
} from "lucide-react";
import type { ButtonIcon } from "@/lib/landingSections";

/** The icon component for each allowed button icon key (src/lib/landingSections.ts). */
export const BUTTON_ICON_COMPONENTS: Record<ButtonIcon, LucideIcon> = {
  "arrow-right": ArrowRight, "arrow-up-right": ArrowUpRight, "chevron-right": ChevronRight, "external-link": ExternalLink,
  download: Download, "file-text": FileText, calendar: CalendarDays, clock: Clock, "map-pin": MapPin, phone: Phone,
  mail: Mail, "message-circle": MessageCircle, send: Send, "user-plus": UserPlus, users: Users, "log-in": LogIn,
  trophy: Trophy, medal: Medal, award: Award, star: Star, rocket: Rocket, play: Play, video: Video, image: Image,
  camera: Camera, "book-open": BookOpen, "graduation-cap": GraduationCap, school: School, info: Info,
  help: CircleHelp, search: Search, globe: Globe, link: Link, ticket: Ticket, gift: Gift, heart: Heart, bell: Bell,
  megaphone: Megaphone, newspaper: Newspaper, cart: ShoppingCart, cpu: Cpu, bot: Bot, code: Code, gamepad: Gamepad2,
  sparkles: Sparkles, check: CircleCheck, home: House, facebook: Facebook, instagram: Instagram, youtube: Youtube,
  twitter: Twitter, linkedin: Linkedin, clipboard: ClipboardList, map: Map, building: Building2, handshake: Handshake,
  lightbulb: Lightbulb, zap: Zap, flag: Flag, "qr-code": QrCode, smartphone: Smartphone, printer: Printer,
  share: Share2, "thumbs-up": ThumbsUp, target: Target, pen: PenLine, badge: BadgeCheck,
};
