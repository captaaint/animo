import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  CreditCard,
  Database,
  Download,
  EllipsisVertical,
  Eye,
  FileText,
  Filter,
  Folder,
  Hash,
  Info,
  LayoutList,
  Mail,
  Menu,
  MessageCircleHeart,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Tag,
  Timer,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

// App-wide icon vocabulary. Names are kept stable (they double as the
// accessible name of icon-only buttons, e.g. "close" / "checkmark").
const ICONS = {
  board: LayoutList,
  check: Check,
  checkmark: Check,
  chevrondown: ChevronDown,
  chevronleft: ChevronLeft,
  chevronright: ChevronRight,
  chevronup: ChevronUp,
  clock: Clock,
  close: X,
  cog: Settings,
  copy: Copy,
  "credit-card": CreditCard,
  database: Database,
  date: Calendar,
  doc: FileText,
  dotmenu: EllipsisVertical,
  download: Download,
  eye: Eye,
  "file-text": FileText,
  filter: Filter,
  folder: Folder,
  hamburger: Menu,
  hash: Hash,
  info: Info,
  mail: Mail,
  "message-heart": MessageCircleHeart,
  palette: Palette,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  sortasc: ArrowUp,
  sortdesc: ArrowDown,
  tag: Tag,
  timer: Timer,
  trash: Trash2,
  "trending-up": TrendingUp,
  trending_up: TrendingUp,
  upload: Upload,
  users: Users,
  warning: TriangleAlert,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

const SIZES = { xs: 12, sm: 14, md: 20, lg: 28 } as const;

export type IconProps = {
  name: IconName;
  size?: keyof typeof SIZES | number | string;
  color?: string;
  className?: string;
  style?: CSSProperties;
};

export function Icon({ name, size = 16, color, className, style }: IconProps) {
  const Glyph = ICONS[name];
  const px = typeof size === "string" && size in SIZES ? SIZES[size as keyof typeof SIZES] : size;
  return (
    <Glyph
      aria-hidden="true"
      size={px}
      color={color ?? "currentColor"}
      strokeWidth={2}
      className={className}
      style={{ flexShrink: 0, ...style }}
      data-icon-name={name}
    />
  );
}
