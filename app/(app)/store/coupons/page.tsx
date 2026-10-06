import { redirect } from "next/navigation";

/** Coupons now live in Offers (one place for codes on the shop, classes and gift certificates). */
export default function CouponsPage() {
  redirect("/offers");
}
