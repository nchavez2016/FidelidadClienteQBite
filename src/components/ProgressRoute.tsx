import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Milestone } from "@/lib/types";
import { getActiveCampaign } from "@/lib/store";
import { Gift, Lock, Check, Flag, Trophy } from "lucide-react";
import gaviotaImg from "@/assets/gaviota3d.png";

interface ProgressRouteProps {
  currentPoints: number;
  animate?: boolean;
  milestones?: Milestone[];
  showFixture?: boolean;
}

const MOBILE_BREAKPOINT = 640;

export default function ProgressRoute({
  currentPoints,
  animate = true,
  milestones: propMilestones,
  showFixture = false,
}: ProgressRouteProps) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : true,
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [bouncing, setBouncing] = useState(false);
  const prevPointsRef = useRef(currentPoints);

  useEffect(() => {
    const campaignForBounce = getActiveCampaign();
    const src = propMilestones || campaignForBounce?.milestones;
    if (!src || src.length === 0) {
      prevPointsRef.current = currentPoints;
      return;
    }
    const sorted = [...src].sort((a, b) => a.order - b.order);
    const prev = prevPointsRef.current;
    const crossed = sorted.some((m) => prev < m.requiredPoints && currentPoints >= m.requiredPoints);
    if (crossed) {
      setBouncing(true);
      const t = setTimeout(() => setBouncing(false), 1200);
      prevPointsRef.current = currentPoints;
      return () => clearTimeout(t);
    }
    prevPointsRef.current = currentPoints;
  }, [currentPoints, propMilestones]);

  const campaign = getActiveCampaign();
  const sourceMilestones = propMilestones || campaign?.milestones;

  if (!sourceMilestones || sourceMilestones.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No hay una ruta activa en este momento.</p>;
  }

  const milestones = [...sourceMilestones].sort((a, b) => a.order - b.order);
  const maxPoints = milestones[milestones.length - 1].requiredPoints;
  const allCompleted = currentPoints >= maxPoints;
  const totalMilestones = milestones.length;
  const segmentSize = totalMilestones > 0 ? 1 / totalMilestones : 0;
  const milestoneRouteRatios = milestones.map((_, idx) => (idx + 1) * segmentSize);
  const milestoneRouteRatio = (idx: number) => milestoneRouteRatios[idx] ?? 0;
  const clampRatio = (value: number) => Math.min(Math.max(value, 0), 1);

  const getSegmentedRouteRatio = () => {
    if (totalMilestones === 0 || currentPoints <= 0) return 0;
    if (currentPoints >= maxPoints) return 1;

    for (let segmentIdx = 0; segmentIdx < totalMilestones; segmentIdx++) {
      const previousMilestonePoints = segmentIdx === 0 ? 0 : milestones[segmentIdx - 1].requiredPoints;
      const nextMilestonePoints = milestones[segmentIdx].requiredPoints;

      if (currentPoints <= nextMilestonePoints) {
        const previousRatio = segmentIdx === 0 ? 0 : milestoneRouteRatios[segmentIdx - 1];
        const nextRatio = milestoneRouteRatios[segmentIdx];
        const segmentPoints = nextMilestonePoints - previousMilestonePoints;
        const localSegmentProgress =
          segmentPoints > 0 ? clampRatio((currentPoints - previousMilestonePoints) / segmentPoints) : 1;

        return currentPoints === nextMilestonePoints
          ? nextRatio
          : previousRatio + localSegmentProgress * (nextRatio - previousRatio);
      }
    }

    return 1;
  };

  const getMilestoneState = (m: Milestone, idx: number): "completed" | "current" | "locked" => {
    if (currentPoints >= m.requiredPoints) return "completed";
    const prev = idx === 0 ? 0 : milestones[idx - 1].requiredPoints;
    if (currentPoints >= prev) return "current";
    return "locked";
  };

  const nodeStyles = {
    completed: "border-2",
    current: "border-2 ring-2",
    locked: "border-2",
  };

  const nodeInlineStyles = {
    completed: { background: "#001F3F", borderColor: "#001F3F" },
    current: { background: "#fff", borderColor: "#2E6DB4", boxShadow: "0 0 0 4px rgba(46,109,180,0.2)" },
    locked: { background: "#fff", borderColor: "#C5A059" },
  };

  const NodeIcon = ({ state, isLast }: { state: "completed" | "current" | "locked"; isLast: boolean }) => {
    if (state === "completed")
      return isLast ? (
        <Trophy className="w-4 h-4" style={{ color: "#fff" }} />
      ) : (
        <Check className="w-4 h-4" style={{ color: "#fff" }} />
      );
    if (state === "current") return <Gift className="w-4 h-4" style={{ color: "#2E6DB4" }} />;
    return <Lock className="w-3.5 h-3.5" style={{ color: "#C5A059" }} />;
  };

  // LAYOUT VERTICAL (mobile)
  if (isMobile) {
    const NODE_SPACING = 52;
    const TRACK_START_TOP = 16;
    const TRACK_LENGTH = totalMilestones * NODE_SPACING;
    const verticalNodeTops = milestones.map((_, idx) => TRACK_START_TOP + (idx + 1) * NODE_SPACING);

    const getVerticalProgressTop = () => {
      if (currentPoints <= 0) return TRACK_START_TOP;
      if (currentPoints >= maxPoints) return verticalNodeTops[verticalNodeTops.length - 1];

      for (let segmentIdx = 0; segmentIdx < totalMilestones; segmentIdx++) {
        const previousMilestonePoints = segmentIdx === 0 ? 0 : milestones[segmentIdx - 1].requiredPoints;
        const nextMilestonePoints = milestones[segmentIdx].requiredPoints;

        if (currentPoints <= nextMilestonePoints) {
          const previousTop = segmentIdx === 0 ? TRACK_START_TOP : verticalNodeTops[segmentIdx - 1];
          const nextTop = verticalNodeTops[segmentIdx];
          const segmentPoints = nextMilestonePoints - previousMilestonePoints;
          const localSegmentProgress =
            segmentPoints > 0 ? clampRatio((currentPoints - previousMilestonePoints) / segmentPoints) : 1;

          return currentPoints === nextMilestonePoints
            ? nextTop
            : previousTop + localSegmentProgress * (nextTop - previousTop);
        }
      }

      return verticalNodeTops[verticalNodeTops.length - 1];
    };

    const fillHeight = getVerticalProgressTop();

    const getGaviotaTop = () => {
      return getVerticalProgressTop();
    };

    const gaviotaTop = getGaviotaTop();

    return (
      <div className="w-full py-2">
        <div className="relative" style={{ paddingLeft: 28 }}>
          <div
            className="absolute"
            style={{
              left: 15,
              top: TRACK_START_TOP,
              height: TRACK_LENGTH,
              width: 3,
              borderRadius: 2,
              background: "#001F3F",
              opacity: 0.15,
            }}
          />
          <motion.div
            key={`vfill-${currentPoints}`}
            className="absolute"
            style={{
              left: 15,
              top: TRACK_START_TOP,
              width: 3,
              borderRadius: 2,
              background: "linear-gradient(180deg, #001F3F, #2E6DB4)",
              minHeight: currentPoints > 0 ? "8px" : "0px",
            }}
            initial={animate ? { height: 0 } : false}
            animate={{ height: fillHeight - TRACK_START_TOP }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          />

          {/* GAVIOTA MOBILE FIX: translateY(-100%) = la BASE de la imagen toca el punto de progreso */}
          <motion.img
            src={gaviotaImg}
            alt="Progreso"
            className="absolute w-7 h-7 object-contain drop-shadow-md z-10"
            style={{ left: -10, transform: "translateY(calc(-100% + 8.22px))" }}
            initial={animate ? { top: 16, opacity: 0 } : false}
            animate={
              bouncing
                ? { top: gaviotaTop, opacity: 1, scale: [1, 1.4, 0.9, 1.15, 1], rotate: [0, -10, 10, -5, 0] }
                : { top: gaviotaTop, opacity: 1 }
            }
            transition={bouncing ? { duration: 1, ease: "easeOut" } : { duration: 0.8, ease: "easeOut", delay: 0.3 }}
          />

          <div className="flex items-center gap-3 relative" style={{ minHeight: 32, marginBottom: NODE_SPACING - 32 }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0"
              style={{ marginLeft: -20, background: "#001F3F", borderColor: "#001F3F" }}
            >
              <Flag className="w-3.5 h-3.5" style={{ color: "#fff" }} />
            </div>
            <div>
              <p className="text-xs font-bold leading-tight" style={{ color: "#001F3F" }}>
                Inicio
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">Punto de partida</p>
            </div>
          </div>

          {milestones.map((m, i) => {
            const state = getMilestoneState(m, i);
            const isLast = i === milestones.length - 1;
            const ptsFaltantes = m.requiredPoints - currentPoints;
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 relative"
                style={{ minHeight: 32, marginBottom: i === milestones.length - 1 ? 0 : NODE_SPACING - 32 }}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${nodeStyles[state]}`}
                  style={{ marginLeft: -20, ...nodeInlineStyles[state] }}
                >
                  <NodeIcon state={state} isLast={isLast} />
                </div>
                <div>
                  <p
                    className="text-xs leading-tight font-bold"
                    style={
                      state === "completed"
                        ? { color: "#001F3F" }
                        : state === "current"
                          ? { color: "#2E6DB4" }
                          : { color: "#C5A059" }
                    }
                  >
                    {m.requiredPoints} pts — {m.rewardName}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight flex items-center gap-1">
                    <Gift className="w-2.5 h-2.5 shrink-0" />
                    {state === "completed" && "Premio desbloqueado"}
                    {state === "current" &&
                      `¡Te ${ptsFaltantes === 1 ? "falta" : "faltan"} ${ptsFaltantes} punto${ptsFaltantes !== 1 ? "s" : ""}!`}
                    {state === "locked" && `${ptsFaltantes} pts más`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // LAYOUT HORIZONTAL (desktop >= 640px)
  const PAD = 20;

  const getFillRatio = () => {
    return getSegmentedRouteRatio();
  };

  const fillRatio = getFillRatio();
  const fixturePoints = [0, 1, 2, 3];

  // toLeft = borde derecho exacto del relleno
  const toLeft = (r: number) => `calc(${PAD}px + (100% - ${PAD * 2}px) * ${r})`;

  const getNodePositionStyle = (r: number, _isFirst: boolean, isLast: boolean): React.CSSProperties => {
    if (isLast) return { right: PAD - 16, top: "12px" };
    return {
      left: `calc(${PAD}px + (100% - ${PAD * 2}px) * ${r})`,
      top: "12px",
      transform: "translateX(-50%)",
    };
  };

  const labelStyles = {
    completed: "font-bold",
    current: "font-bold",
    locked: "",
  };

  const labelColorStyles = {
    completed: { color: "#001F3F" },
    current: { color: "#2E6DB4" },
    locked: { color: "#C5A059" },
  };

  return (
    <div className="w-full py-4">
      {showFixture && (
        <div className="mb-3 grid grid-cols-4 gap-1.5 rounded-lg border border-dashed border-secondary/30 bg-secondary/5 p-2">
          {fixturePoints.map((points) => (
            <div key={points} className="text-center text-[10px] font-bold text-secondary">
              {points} pts
            </div>
          ))}
        </div>
      )}
      <div className="relative overflow-visible" style={{ minHeight: "110px", padding: `0 ${PAD}px` }}>
        <div
          className="absolute h-2.5 rounded-full"
          style={{ top: "20px", left: PAD, right: PAD, background: "rgba(0,31,63,0.12)" }}
        />

        <motion.div
          key={`hfill-${currentPoints}`}
          className="absolute h-2.5 rounded-full"
          style={{
            top: "20px",
            left: PAD,
            background: "linear-gradient(90deg, #001F3F, #2E6DB4)",
            minWidth: currentPoints > 0 ? "8px" : "0px",
          }}
          initial={animate ? { width: 0 } : false}
          animate={{ width: `calc((100% - ${PAD * 2}px) * ${fillRatio} + 16px)` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        />

        {/* Gaviota anclada al avance real: centrada sobre el final del progreso/hito actual. */}
        <motion.div
          className="absolute z-20"
          style={{ top: "-2px", transform: "translateX(calc(-50% + 34px))" }}
          initial={animate ? { left: toLeft(0) } : false}
          animate={{ left: toLeft(fillRatio) }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        >
          <motion.img
            src={gaviotaImg}
            alt="Progreso"
            className="w-11 h-11 object-contain drop-shadow-lg"
            animate={
              bouncing
                ? { scale: [1, 1.5, 0.85, 1.2, 1], rotate: [0, -15, 15, -8, 0], y: [0, -10, 0] }
                : allCompleted
                  ? { scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }
                  : { y: [0, -3, 0] }
            }
            transition={
              bouncing
                ? { duration: 1, ease: "easeOut", repeat: 0 }
                : { duration: 2, repeat: Infinity, ease: "easeInOut" }
            }
          />
        </motion.div>

        <div className="absolute flex flex-col items-start" style={{ left: PAD, top: "12px" }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center border-2"
            style={{ background: "#001F3F", borderColor: "#001F3F" }}
          >
            <Flag className="w-3.5 h-3.5" style={{ color: "#fff" }} />
          </div>
          <span className="text-[9px] mt-1 font-bold" style={{ color: "#001F3F" }}>
            Inicio
          </span>
        </div>

        {milestones.map((m, i) => {
          const state = getMilestoneState(m, i);
          const r = milestoneRouteRatio(i);
          const isLast = i === milestones.length - 1;
          const isFirst = i === 0;
          const posStyle = getNodePositionStyle(r, isFirst, isLast);
          const alignItems = isLast ? "items-end" : "items-center";
          const textAlign = isLast ? "text-right" : "text-center";

          return (
            <motion.div
              key={m.id}
              className={`absolute flex flex-col ${alignItems}`}
              style={posStyle}
              initial={animate ? { opacity: 0, scale: 0.8 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + i * 0.1, type: "spring", stiffness: 200 }}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${nodeStyles[state]}`}
                style={nodeInlineStyles[state]}
              >
                <NodeIcon state={state} isLast={isLast} />
              </div>
              <span
                className={`text-[10px] mt-1 whitespace-nowrap ${labelStyles[state]} ${textAlign}`}
                style={labelColorStyles[state]}
              >
                {m.requiredPoints} pts
              </span>
              <div className={`flex items-center gap-0.5 ${isLast ? "flex-row-reverse" : ""}`}>
                <Gift
                  className="w-2.5 h-2.5 shrink-0"
                  style={{ color: state === "completed" ? "#001F3F" : "#C5A059" }}
                />
                <span
                  className={`text-[8px] text-muted-foreground leading-tight max-w-[60px] break-words ${textAlign}`}
                >
                  {m.rewardName}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
