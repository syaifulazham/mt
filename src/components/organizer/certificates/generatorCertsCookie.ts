// Generator → issued certificates: the "Kumpulkan ikut" choice is kept in this
// cookie (read by the page on the server, written by GeneratorCertificatesClient).
export const GEN_CERTS_GROUP_COOKIE = "mt_org_cert_gen_certs_group";
export const GEN_CERTS_GROUP_VALUES = ["none", "state", "rank", "competition"] as const;
export type GenCertsGroupBy = (typeof GEN_CERTS_GROUP_VALUES)[number];
