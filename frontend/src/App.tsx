import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { Layout } from '@/components/Layout'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { BotsPage } from '@/features/admin/bots/BotsPage'
import { CitasPage } from '@/features/admin/citas/CitasPage'
import { ClientesPage } from '@/features/admin/clientes/ClientesPage'
import { InventarioPage } from '@/features/admin/inventario/InventarioPage'
import { LoginPage } from '@/features/admin/LoginPage'
import { MetricasPage } from '@/features/admin/metricas/MetricasPage'
import { HistorialPage } from '@/features/admin/ventas/HistorialPage'
import { RegistrarVentaPage } from '@/features/admin/ventas/RegistrarVentaPage'
import { VentaDetallePage } from '@/features/admin/ventas/VentaDetallePage'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { ComparePage } from '@/features/compare/ComparePage'
import { CompareProvider } from '@/features/compare/CompareContext'
import { VehicleDetailPage } from '@/features/detail/VehicleDetailPage'
import { HomePage } from '@/features/home/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
})

/** Inicio del panel: el admin entra a las métricas; el vendedor, a las citas (no tiene métricas). */
function AdminHome() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'admin' ? 'metricas' : 'citas'} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CompareProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="catalogo" element={<CatalogPage />} />
                <Route path="catalogo/:id" element={<VehicleDetailPage />} />
                <Route path="comparar" element={<ComparePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route path="admin/login" element={<LoginPage />} />
              <Route
                path="admin"
                element={
                  <RequireRole roles={['admin', 'vendedor']}>
                    <AdminLayout />
                  </RequireRole>
                }
              >
                <Route index element={<AdminHome />} />
                <Route
                  path="metricas"
                  element={
                    <RequireRole roles={['admin']}>
                      <MetricasPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="inventario"
                  element={
                    <RequireRole roles={['admin']}>
                      <InventarioPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="bots"
                  element={
                    <RequireRole roles={['admin']}>
                      <BotsPage />
                    </RequireRole>
                  }
                />
                <Route path="citas" element={<CitasPage />} />
                <Route path="clientes" element={<ClientesPage />} />
                <Route path="ventas/nueva" element={<RegistrarVentaPage />} />
                <Route
                  path="ventas"
                  element={
                    <RequireRole roles={['admin']}>
                      <HistorialPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="ventas/:id"
                  element={
                    <RequireRole roles={['admin']}>
                      <VentaDetallePage />
                    </RequireRole>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </CompareProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
