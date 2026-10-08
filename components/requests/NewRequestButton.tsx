"use client";

import { useFormStatus } from "react-dom";
import { Button, PlusIcon } from "@/components/ui";

/**
 * Submit button of the "New request" form. A form (POST), not a link, so
 * prefetching or reloading a page can never create a draft by accident.
 */
export function NewRequestButton({
  className,
  fullWidth,
}: {
  className?: string;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      loading={pending}
      iconLeft={<PlusIcon />}
      fullWidth={fullWidth}
      className={className}
    >
      New request
    </Button>
  );
}
