## Política de documentación de cambios

Este proyecto mantiene `docs/qbites_bitacora_setup.md` como registro vivo de
decisiones técnicas, bugs encontrados y correcciones aplicadas.

Regla: después de que el usuario CONFIRME explícitamente que un cambio fue
aplicado y validado (no antes, no ante una propuesta sin confirmar), agrega
una entrada a `docs/qbites_bitacora_setup.md` con:
- Qué problema se encontró (síntoma + causa raíz si se identificó)
- Qué se cambió exactamente (archivo/línea, o SQL ejecutado)
- Cómo se validó

No documentes intentos, propuestas, o diffs que el usuario no haya confirmado
como aplicados. Si el cambio es de código (no de base de datos), el propio
commit de git ya lo registra — en ese caso, solo agrega una entrada a la
bitácora si además hubo una decisión de negocio o arquitectura detrás
(ej. "se decidió no tocar getBranchAccent()"), no por cada cambio trivial.