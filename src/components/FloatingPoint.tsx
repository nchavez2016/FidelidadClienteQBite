import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface FloatingPointProps {
  show: boolean;
  onDone: () => void;
  amount?: number;
  multiplier?: number;
}

export default function FloatingPoint({ show, onDone, amount = 1, multiplier }: FloatingPointProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onDone, 1000);
      return () => clearTimeout(timer);
    }
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed top-1/2 left-1/2 z-50 font-heading font-bold text-accent pointer-events-none flex flex-col items-center"
          initial={{ opacity: 1, y: 0, x: '-50%' }}
          animate={{ opacity: 0, y: -80 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          <span className="text-5xl">+{amount} {multiplier && multiplier > 1 ? '🔥' : '🎉'}</span>
          {multiplier && multiplier > 1 && (
            <span className="text-xl mt-1 text-primary">Bonus x{multiplier}</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
