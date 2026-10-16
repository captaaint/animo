import { Dialog } from "@ark-ui/react/dialog";
import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import cx from "classnames";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { useIsMobile } from "../lib/useIsMobile";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

// Dialogs trap focus and lock scrolling, but are deliberately not `modal`:
// zag's modal mode aria-hides / inerts everything outside the dialog, which
// (a) also hides popovers portaled from inside it (combobox and date picker
// menus), and (b) is left behind on #root when a dialog unmounts while open.
const DIALOG_BEHAVIOR = {
  modal: false,
  trapFocus: true,
  preventScroll: true,
  lazyMount: true,
  unmountOnExit: true,
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Modal — centered dialog (desktop).
// ---------------------------------------------------------------------------------------------------------------------

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: number | string;
  height?: string;
  showClose?: boolean;
  /** No padding around the body (e.g. the PDF preview). */
  flush?: boolean;
  className?: string;
};

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 520,
  height,
  showClose = false,
  flush,
  className,
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(d) => {
        if (!d.open) onClose();
      }}
      {...DIALOG_BEHAVIOR}
    >
      <Portal>
        <Dialog.Backdrop className="overlay-backdrop" />
        <Dialog.Positioner className="modal-positioner">
          <Dialog.Content
            className={cx("modal", flush && "modal--flush", className)}
            style={{ maxWidth, height }}
          >
            {(title || showClose) && (
              <div className="modal__header">
                {title && <Dialog.Title className="modal__title">{title}</Dialog.Title>}
                {showClose && (
                  <Dialog.CloseTrigger asChild>
                    <Button icon="close" variant="ghost" themeColor="secondary" size="sm" className="modal__close" />
                  </Dialog.CloseTrigger>
                )}
              </div>
            )}
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Drawer — bottom sheet (mobile).
// ---------------------------------------------------------------------------------------------------------------------

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Pinned header; stays on screen while the body scrolls. */
  header?: ReactNode;
  title?: string;
  children: ReactNode;
  /** Open tall (fixed height) instead of sizing to the content. */
  tall?: boolean;
  testId?: string;
};

export function Drawer({ open, onClose, header, title, children, tall, testId }: DrawerProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(d) => {
        if (!d.open) onClose();
      }}
      {...DIALOG_BEHAVIOR}
    >
      <Portal>
        <Dialog.Backdrop className="overlay-backdrop" />
        <Dialog.Positioner className="drawer-positioner">
          <Dialog.Content
            className={cx("drawer", tall && "drawer--tall")}
            aria-label={title}
            data-testid={testId}
          >
            {header && <div className="drawer__header">{header}</div>}
            <div className="drawer__body">{children}</div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/** Standard drawer header: round close · title · round primary action. */
export function DrawerHeader({
  title,
  onClose,
  action,
}: {
  title: ReactNode;
  onClose: () => void;
  action?: ReactNode;
}) {
  return (
    <>
      <Button icon="close" variant="outlined" themeColor="secondary" round onClick={onClose} />
      <div className="drawer__title">{title}</div>
      {action ?? <span className="drawer__spacer" />}
    </>
  );
}

/** Primary round icon button for drawer headers. */
export function DrawerAction({
  icon = "checkmark",
  onClick,
  disabled,
  attention,
}: {
  icon?: IconName;
  onClick: () => void;
  disabled?: boolean;
  attention?: boolean;
}) {
  return (
    <Button
      icon={icon}
      round
      themeColor={attention ? "attention" : "primary"}
      onClick={onClick}
      disabled={disabled}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Sheet — Modal on desktop, Drawer on mobile, same content.
// ---------------------------------------------------------------------------------------------------------------------

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Desktop-only footer row (Cancel / Save …). */
  footer?: ReactNode;
  /** Mobile header action (usually a round ✓). */
  mobileAction?: ReactNode;
  maxWidth?: number;
  tall?: boolean;
};

export function Sheet({ open, onClose, title, children, footer, mobileAction, maxWidth, tall }: SheetProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={title}
        tall={tall}
        header={<DrawerHeader title={title} onClose={onClose} action={mobileAction} />}
      >
        {children}
      </Drawer>
    );
  }
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={maxWidth} showClose>
      <div className="stack stack--gap-4">
        {children}
        {footer && <div className="row row--gap-3 modal__footer">{footer}</div>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// DropdownMenu
// ---------------------------------------------------------------------------------------------------------------------

export type MenuItemSpec =
  | { separator: true }
  | { label: ReactNode; icon?: IconName; onSelect: () => void; testId?: string; danger?: boolean };

export function DropdownMenu({
  trigger,
  items,
  placement = "bottom-end",
  style,
}: {
  trigger: ReactElement;
  items: MenuItemSpec[];
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  style?: CSSProperties;
}) {
  return (
    <Menu.Root positioning={{ placement }} lazyMount unmountOnExit>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Portal>
        <Menu.Positioner className="menu-positioner">
          <Menu.Content className="menu" style={style}>
            {items.map((item, i) =>
              "separator" in item ? (
                <Menu.Separator key={i} className="menu__separator" />
              ) : (
                <Menu.Item
                  key={i}
                  value={String(i)}
                  className={cx("menu__item", item.danger && "menu__item--danger")}
                  onSelect={item.onSelect}
                  data-testid={item.testId}
                >
                  {item.icon && <Icon name={item.icon} size={16} />}
                  {item.label}
                </Menu.Item>
              ),
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
