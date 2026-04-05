import Navbar from './Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <main className="pt-16 min-h-screen">
        <div className="max-w-6xl mx-auto px-8 py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
