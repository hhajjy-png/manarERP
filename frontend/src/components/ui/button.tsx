import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * ── لماذا `forwardRef` هنا رغم أن النسخة الأصلية (upstream) لا تستخدمه ──────────
 *
 * ملف shadcn الأصلي مكتوب لاصطلاح **React 19**، حيث صار `ref` خاصية عادية تصل ضمن
 * `props` لمكوّنات الدوال. هذا المشروع يعمل على **React 18.3.1**، وفيها `createElement`
 * ينتزع `ref` من خصائص JSX ولا يُمرّره لمكوّن دالة إطلاقًا، ويطبع:
 *   «Function components cannot be given refs».
 *
 * الأثر لم يكن تجميليًا: `CalendarDayButton` في `ui/calendar.tsx` يحتاج عقدة الـDOM
 * فعليًا (`ref.current?.focus()` عند `modifiers.focused`) — وهي آلية react-day-picker
 * لتحريك التركيز بين الأيام بأسهم لوحة المفاتيح. وبلا تمرير الـref كان `ref.current`
 * يبقى `null` أبدًا، فتتعطّل تلك الحركة بصمت.
 *
 * ولم يلتقطه TypeScript لأن النوع كان `React.ComponentProps<"button">` وهو **يتضمّن
 * `ref`** — فيمرّ موضع النداء بالفحص بينما يُسقطه التشغيل. لذلك صار النوع
 * `ComponentPropsWithoutRef` ومصدر `ref` الوحيد هو `forwardRef`: لا إعلان مزدوج،
 * ولا فجوة بين ما يعد به النوع وما ينفّذه التشغيل.
 *
 * لا شيء آخر تغيّر: نفس `buttonVariants`، نفس الافتراضيات، نفس `data-*`، نفس دمج
 * `className`، ونفس سلوك `asChild` (‏`Slot.Root` يدعم الـref أصلًا فيَدمجه مع ref الابن).
 * يُراجَع عند الترقية إلى React 19 — حينها يعود الاصطلاح الأصلي كافيًا.
 */
const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(function Button(
  { className, variant = "default", size = "default", asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
