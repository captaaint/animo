import { forwardRef, type CSSProperties, type ReactNode } from "react";

type VerticalAlignment = "start" | "center" | "end" | "stretch" | "baseline";

type Props = {
  children?: ReactNode;
  gap?: string;
  rowGap?: string;
  columnGap?: string;
  verticalAlignment?: VerticalAlignment;
  style?: CSSProperties;
  className?: string;
};

const alignMap: Record<VerticalAlignment, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  stretch: "stretch",
  baseline: "baseline",
};

export const CenterRow = forwardRef<HTMLDivElement, Props>(function CenterRow(
  { children, gap, rowGap, columnGap, verticalAlignment = "start", style, className },
  ref,
) {
  return (
    <div
      ref={ref}
      className={className}
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: alignMap[verticalAlignment] ?? "flex-start",
        columnGap: columnGap ?? gap,
        rowGap: rowGap ?? gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
});

export default CenterRow;
