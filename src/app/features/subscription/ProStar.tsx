import React from "react";

/** The eight-pointed star of the rub el hizb, Rafeeq Pro's mark. Colour and
 *  size come from the caller's class. */
const ProStar: React.FC<{ className: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="1" />
    <rect x="5" y="5" width="14" height="14" rx="1" transform="rotate(45 12 12)" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

export default ProStar;
