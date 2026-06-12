# Optimización de carga inicial

Cambios mínimos. No se tocan rutas, ProtectedRoute, servicios, signIn/signUp/signOut ni idle timeout.

## 1) `src/App.tsx` — lazy loading

- Mantener `Index` como import estático (primera pantalla).
- Convertir a `React.lazy()`: `CustomerLogin`, `CustomerRegister`, `CustomerDashboard`, `StaffLogin`, `StaffPanel`, `NotFound`.
- Envolver `<Routes>` con un único `<Suspense>` cuyo fallback use `bg-gradient-navy` (mismo fondo que los logins / Index) para no provocar parpadeo de color:

```tsx
<Suspense fallback={
  <div className="min-h-screen bg-gradient-navy flex items-center justify-center">
    <div className="animate-pulse text-white">Cargando...</div>
  </div>
}>
  <Routes>…</Routes>
</Suspense>
```

Resultado: en `/` el bundle inicial deja de incluir el código de `CustomerDashboard` y `StaffPanel` (y resto de páginas no usadas).

## 2) `src/contexts/AuthContext.tsx` — diferir hidratación en reload

- Añadir estado `const [isHydrating, setIsHydrating] = useState(false);`
- Añadir `isHydrating: boolean;` a `AuthContextValue`.
- Añadirlo al `value` del provider y a las dependencias del `useMemo`.
- **Sólo** en la rama `supabase.auth.getSession().then(...)` (rehidratación al recargar), reemplazar:

```ts
// ANTES
hydratePostAuth().finally(() => {
  rolesLoadedForUserRef.current = data.session!.user.id;
  setRolesLoaded(true);
  setLoading(false);
});

// DESPUÉS
rolesLoadedForUserRef.current = data.session!.user.id;
setRolesLoaded(true);
setLoading(false);
setIsHydrating(true);
void hydratePostAuth()
  .catch(err => console.error('Hydration error:', err))
  .finally(() => setIsHydrating(false));
```

- **No tocar** las ramas `signIn` ni `signUp`: siguen con `await hydratePostAuth()` para evitar flash post-login.
- La rama del listener `onAuthStateChange` tampoco se modifica.

## 3) `src/pages/CustomerDashboard.tsx` y `src/pages/StaffPanel.tsx` — skeleton durante hidratación

- En `CustomerDashboard.tsx` añadir `import { useAuth } from "@/hooks/useAuth";` (StaffPanel ya lo importa).
- En ambos componentes, leer `const { isHydrating } = useAuth();` al inicio del componente.
- **Reglas de Hooks**: el early return va **después** de todos los hooks existentes (`useCustomerSession`, `useStaffAuth`, `useQuery`, `useState`, `useEffect`, etc.), nunca antes. Todos los hooks deben ejecutarse siempre en el mismo orden.

Skeleton común:

```tsx
if (isHydrating) {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
      </div>
    </div>
  );
}
```

## Verificación

- En `/`: Network no carga los chunks de `CustomerDashboard` ni `StaffPanel`.
- Login (cliente y staff): entra al panel sin flash (signIn sigue esperando `hydratePostAuth`).
- Recargar con sesión activa: aparece el skeleton del panel mientras `isHydrating` es true, luego el contenido real.
- Los hooks de los paneles se ejecutan siempre — no hay early return antes de ellos.
- Suscripciones realtime siguen activándose dentro de `hydratePostAuth` (sin cambios).
