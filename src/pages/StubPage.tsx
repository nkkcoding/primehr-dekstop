export default function StubPage({ title, text }: { title: string; text: string }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="lead">Navigare pe rol — conținut neportat în acest scaffold.</p>
      <div className="stub">{text}</div>
    </div>
  );
}
