import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface FloatingPointProps {
  show: boolean;
  onDone: () => void;
}

export default function FloatingPoint({ show, onDone }: FloatingPointProps) {
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
          className="fixed top-1/2 left-1/2 z-50 text-5xl font-heading font-bold text-accent pointer-events-none"
          initial={{ opacity: 1, y: 0, x: '-50%' }}
          animate={{ opacity: 0, y: -80 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          +1 🎉
        </motion.div>
      )}
    </AnimatePresence>
  );
}
