import React from "react";

export function FormSection({ title, description, number, children }: {
  title: string; description: string; number: string; children: React.ReactNode;
}) {
  return <section className="entry-section" aria-label={title}>
    <div className="entry-section-heading">
      <span className="entry-section-number" aria-hidden="true">{number}</span>
      <div><h3>{title}</h3><p>{description}</p></div>
    </div>
    <div className="entry-section-fields">{children}</div>
  </section>;
}
