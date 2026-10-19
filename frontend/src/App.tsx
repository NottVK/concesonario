import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireRole } from '@/auth/guards'
import { Layout } from '@/components/Layout'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { CitasPage } from '@/features/admin/citas/CitasPage'
import { ClientesPage } from '@/features/admin/clientes/ClientesPage'
import { LoginPage } from '@/features/admin/LoginPage'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { ComparePage } from '@/features/compare/ComparePage'
import { CompareProvider } from '@/features/compare/CompareContext'
import { VehicleDetailPage } from '@/features/detail/VehicleDetailPage'
import { HomePage } from '@/features/home/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
})

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
                <Route index element={<Navigate to="citas" replace />} />
                <Route path="citas" element={<CitasPage />} />
                <Route path="clientes" element={<ClientesPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </CompareProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
