import { createFileRoute } from "@tanstack/react-router";
import { Check, Mail, MapPin, Phone } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us | Ratna Nidhi Central Kitchen" },
      { name: "description", content: "Get in touch with the Ratna Nidhi Central Kitchen or sign up to volunteer." },
      { property: "og:title", content: "Contact Us | Ratna Nidhi Central Kitchen" },
      { property: "og:description", content: "Reach out or join as a volunteer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSaving, setContactSaving] = useState(false);

  const [volunteerSent, setVolunteerSent] = useState(false);
  const [volunteerError, setVolunteerError] = useState<string | null>(null);
  const [volunteerSaving, setVolunteerSaving] = useState(false);

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContactError(null);
    setContactSaving(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const { error } = await supabase.from("contact_messages").insert({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      message: String(form.get("message") ?? "").trim(),
    });
    setContactSaving(false);
    if (error) {
      setContactError(error.message);
      return;
    }
    formEl.reset();
    setContactSent(true);
  }

  async function submitVolunteer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVolunteerError(null);
    setVolunteerSaving(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const { error } = await supabase.from("volunteer_signups").insert({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim() || null,
      location_label: String(form.get("location") ?? "").trim() || null,
      message: String(form.get("message") ?? "").trim() || null,
    });
    setVolunteerSaving(false);
    if (error) {
      setVolunteerError(error.message);
      return;
    }
    formEl.reset();
    setVolunteerSent(true);
  }

  return (
    <AppShell>
      <PageIntro
        eyebrow="Contact / Get in touch"
        title={<>We would love <span className="italic">to hear from you.</span></>}
        description="Questions about the Central Kitchen, a partnership idea, or ready to volunteer — send us a message below."
      />

      <section className="grid lg:grid-cols-2">
        <div className="border-b border-border px-4 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <h2 className="label-caps">Contact us</h2>
          {contactSent ? (
            <div className="mt-6 border border-border-strong bg-card p-6">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-5" />
              </div>
              <h3 className="mt-5 font-display text-2xl">Message received</h3>
              <p className="mt-2 text-sm text-muted-foreground">Thanks for reaching out — your message has been saved and our team will follow up.</p>
              <Button className="mt-6" variant="outline" onClick={() => setContactSent(false)}>
                Send another message
              </Button>
            </div>
          ) : (
            <form className="mt-6 space-y-6" onSubmit={submitContact}>
              <label className="block">
                <span className="label-caps text-muted-foreground">Name</span>
                <input required name="name" className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
              </label>
              <label className="block">
                <span className="label-caps text-muted-foreground">Email</span>
                <input required type="email" name="email" className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
              </label>
              <label className="block">
                <span className="label-caps text-muted-foreground">Message</span>
                <textarea required name="message" rows={4} className="mt-2 w-full resize-none border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
              </label>
              {contactError && <p className="text-sm text-accent">{contactError}</p>}
              <Button type="submit" size="wide" className="w-full" disabled={contactSaving}>
                {contactSaving ? "Sending…" : "Send message"}
              </Button>
            </form>
          )}

          <div className="mt-10 space-y-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Mail className="size-4 shrink-0 text-accent" />
              Messages go straight to the team through this form.
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-accent" />
              Serving children at partner schools and distribution centers.
            </p>
          </div>
        </div>

        <div className="bg-muted/25 px-4 py-8 sm:px-8 lg:px-10">
          <h2 className="label-caps">Volunteer sign-up</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Tell us about yourself and a kitchen coordinator will connect with you.
          </p>
          {volunteerSent ? (
            <div className="mt-6 border border-border-strong bg-card p-6">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-5" />
              </div>
              <h3 className="mt-5 font-display text-2xl">You&apos;re on the list</h3>
              <p className="mt-2 text-sm text-muted-foreground">Your volunteer sign-up has been saved. We will reach out with next steps.</p>
              <Button className="mt-6" variant="outline" onClick={() => setVolunteerSent(false)}>
                Sign up someone else
              </Button>
            </div>
          ) : (
            <form className="mt-6 space-y-6" onSubmit={submitVolunteer}>
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="block">
                  <span className="label-caps text-muted-foreground">Name</span>
                  <input required name="name" className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
                </label>
                <label className="block">
                  <span className="label-caps text-muted-foreground">Phone</span>
                  <input name="phone" type="tel" className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
                </label>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="block">
                  <span className="label-caps text-muted-foreground">Email</span>
                  <input required type="email" name="email" className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
                </label>
                <label className="block">
                  <span className="label-caps text-muted-foreground">City / area</span>
                  <input name="location" className="mt-2 h-12 w-full border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
                </label>
              </div>
              <label className="block">
                <span className="label-caps text-muted-foreground">Availability / notes (optional)</span>
                <textarea name="message" rows={3} className="mt-2 w-full resize-none border-b border-input bg-transparent text-sm outline-none focus:border-foreground" />
              </label>
              {volunteerError && <p className="text-sm text-accent">{volunteerError}</p>}
              <Button type="submit" size="wide" className="w-full" disabled={volunteerSaving}>
                {volunteerSaving ? "Submitting…" : "Sign up to volunteer"}
              </Button>
            </form>
          )}

          <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="size-3.5 shrink-0 text-accent" />
            A coordinator will contact you using the details you provide above.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
