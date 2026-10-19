import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
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
        <CompareProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="catalogo" element={<CatalogPage />} />
            <Route path="catalogo/:id" element={<VehicleDetailPage />} />
            <Route path="comparar" element={<ComparePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        </CompareProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
