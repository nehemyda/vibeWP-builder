import type { CSSProperties } from "react";

export type BusinessProfileValues = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  websiteAddress?: string | null;
  businessCategories?: string | null;
  tags?: string | null;
  timezone?: string | null;
  phoneNumber?: string | null;
} | null;

const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
};
const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  fontWeight: 600,
  marginBottom: "0.4rem",
};

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} style={labelStyle}>
        {label}
      </label>
      <input id={name} name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} style={fieldStyle} />
    </div>
  );
}

/** Shared "Business details" field grid — used inside a <form> on both agency and site pages. */
export function BusinessDetailsFields({ profile }: { profile: BusinessProfileValues }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
      <Field label="Address" name="address" defaultValue={profile?.address} placeholder="123 Main St" />
      <Field label="City" name="city" defaultValue={profile?.city} />
      <Field label="State" name="state" defaultValue={profile?.state} />
      <Field label="ZIP" name="zip" defaultValue={profile?.zip} />
      <Field label="Country" name="country" defaultValue={profile?.country} />
      <Field
        label="Website address"
        name="websiteAddress"
        defaultValue={profile?.websiteAddress}
        placeholder="https://example.com"
      />
      <Field
        label="Business categories"
        name="businessCategories"
        defaultValue={profile?.businessCategories}
        placeholder="Music producer"
      />
      <Field label="Tag(s)" name="tags" defaultValue={profile?.tags} placeholder="META, Remarketing-Win" />
      <Field label="Timezone" name="timezone" defaultValue={profile?.timezone} placeholder="America/New_York" />
      <Field label="Phone number" name="phoneNumber" defaultValue={profile?.phoneNumber} />
    </div>
  );
}
