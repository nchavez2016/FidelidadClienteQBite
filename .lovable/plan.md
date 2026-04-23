
Aplicaré el ajuste en `src/components/ProgressRoute.tsx`, específicamente en la versión horizontal/desktop de la barra de progreso.

## Cambio exacto

Actualmente el contenedor de la Gaviota ya está posicionado con:

```tsx
className="absolute z-20"
```

pero el `translateX(-100%)` está aplicado en la imagen interna. Lo moveré al contenedor para que el punto `left: toLeft(fillRatio)` represente el borde real del progreso y el contenedor completo se desplace hacia la izquierda por el ancho de la Gaviota.

## Implementación

Actualizaré este bloque:

```tsx
<motion.div
  className="absolute z-20"
  style={{ top: '-2px' }}
  initial={animate ? { left: toLeft(0) } : false}
  animate={{ left: toLeft(fillRatio) }}
>
  <motion.img
    style={{ transform: 'translateX(-100%)' }}
  />
</motion.div>
```

para que quede conceptualmente así:

```tsx
<motion.div
  className="absolute z-20"
  style={{
    top: '-2px',
    transform: 'translateX(-100%)',
  }}
  initial={animate ? { left: toLeft(0) } : false}
  animate={{ left: toLeft(fillRatio) }}
>
  <motion.img
    src={gaviotaImg}
    alt="Progreso"
    className="w-11 h-11 object-contain drop-shadow-lg"
  />
</motion.div>
```

## Cuidado con las animaciones

Mantendré las animaciones de `scale`, `rotate` y `y` en la imagen interna para que no sobrescriban el `translateX(-100%)` del contenedor. Así se evita que `framer-motion` mezcle el desplazamiento horizontal con el rebote o flotación de la Gaviota.

## Resultado esperado

Cuando el cliente tenga pocos puntos, por ejemplo 1 punto, la Gaviota dejará de verse adelantada respecto al progreso. El avance seguirá calculándose con `fillRatio`, pero la Gaviota quedará visualmente pegada al final real del relleno de la barra.

## Archivo a modificar

```text
src/components/ProgressRoute.tsx
```
