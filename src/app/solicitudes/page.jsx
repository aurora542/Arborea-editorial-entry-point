import RequestsPage from "@/components/kiosk/RequestsPage";

export const metadata = {
  title: "Solicitudes — Arborea",
  description: "Solicitudes rápidas para huéspedes desde la tablet de la casa.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <RequestsPage />;
}
