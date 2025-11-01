"use client";

import {
  useCreateJobFormState,
  type CreateJobFormLocks,
  type CreateJobFormPrefill
} from "@/lib/jobs/hooks/useCreateJobFormState";

import { CreateJobFormDefaultView } from "./default-view";
import { CreateJobFormEmbedView } from "./embed-view";

export type CreateJobFormProps = {
  disabled?: boolean;
};

export type CreateJobFormEmbedProps = CreateJobFormProps & {
  prefill?: CreateJobFormPrefill;
  lock?: CreateJobFormLocks;
};

export function CreateJobForm({ disabled = false }: CreateJobFormProps) {
  const controller = useCreateJobFormState({ disabled });
  return <CreateJobFormDefaultView controller={controller} />;
}

export function CreateJobFormEmbed({ disabled = false, prefill, lock }: CreateJobFormEmbedProps) {
  const controller = useCreateJobFormState({ disabled, prefill, lock });
  return <CreateJobFormEmbedView controller={controller} />;
}
