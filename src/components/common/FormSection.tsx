import React from "react";

export function FormSection({ title, description, number, extra, children }: {
  title: React.ReactNode; description: string; number: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return <section className="entry-section" aria-label={typeof title === "string" ? title : undefined}>
    <div className="entry-section-heading">
      <span className="entry-section-number" aria-hidden="true">{number}</span>
      <div className="min-w-0 flex-1"><h3>{title}</h3><p>{description}</p></div>
      {extra && <div className="shrink-0 self-center">{extra}</div>}
    </div>
    <div className="entry-section-fields">{children}</div>
  </section>;
}
