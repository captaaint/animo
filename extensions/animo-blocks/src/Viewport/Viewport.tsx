import { useEffect } from "react";

type UpdateStateFn = (
  newState: Record<string, unknown>,
  options?: { initial?: boolean },
) => void;

export type ViewportProps = {
  updateState?: UpdateStateFn;
};

const MOBILE_MAX_WIDTH = 640;

export function Viewport(props: ViewportProps) {
  const { updateState } = props;

  useEffect(() => {
    if (!updateState) return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const publish = () => {
      updateState({
        value: {
          isMobile: mq.matches,
          isDesktop: !mq.matches,
          width: window.innerWidth,
          height: window.innerHeight,
        },
      });
    };
    publish();
    mq.addEventListener("change", publish);
    window.addEventListener("resize", publish);
    return () => {
      mq.removeEventListener("change", publish);
      window.removeEventListener("resize", publish);
    };
  }, [updateState]);

  return null;
}

export default Viewport;
