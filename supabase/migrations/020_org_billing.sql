-- ─────────────────────────────────────────────────────────────────────────────
-- 020_org_billing.sql
-- Org-level Stripe subscription tracking for SaaS billing.
-- Plans: starter (free), professional (per-seat), enterprise (custom).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.la_organizations
  -- Stripe identifiers
  add column stripe_customer_id            text unique,
  add column stripe_subscription_id        text unique,

  -- Plan & status
  add column plan_id                       text not null default 'starter'
    check (plan_id in ('starter', 'professional', 'enterprise')),
  add column subscription_status           text not null default 'active'
    check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete')),

  -- Seat count (Pro plan is per-seat)
  add column seat_count                    integer not null default 3,

  -- Billing interval for the current subscription
  add column billing_interval              text not null default 'monthly'
    check (billing_interval in ('monthly', 'annual')),

  -- Current period end (renewal / expiry date)
  add column subscription_current_period_end timestamptz,

  -- Trial
  add column trial_ends_at                 timestamptz;

-- Index for Stripe webhook lookups
create index la_organizations_stripe_customer_idx
  on public.la_organizations (stripe_customer_id)
  where stripe_customer_id is not null;

create index la_organizations_stripe_sub_idx
  on public.la_organizations (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.la_organizations.plan_id               is 'Current plan: starter | professional | enterprise';
comment on column public.la_organizations.subscription_status   is 'Stripe subscription status mirrored here via webhook';
comment on column public.la_organizations.seat_count            is 'Number of licensed seats (relevant for Professional plan pricing)';
