<script setup lang="ts">
import { invitationSchema } from '@cms/shared'
import { onMounted, ref } from 'vue'
import CopyField from '@/components/CopyField.vue'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, errorMessage } from '@/lib/api'
import { type Members, linkUrl } from '@/lib/spaces'
import SettingsSection from './SettingsSection.vue'

const props = defineProps<{ slug: string }>()

const data = ref<Members | null>(null)
const email = ref('')
const error = ref('')
const notice = ref('')
/** Dernier lien généré, à copier et transmettre à la main. */
const link = ref<{ label: string; url: string } | null>(null)

const base = () => `/spaces/${encodeURIComponent(props.slug)}`
const expires = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))

async function load() {
  data.value = await api<Members>(`${base()}/members`)
}
onMounted(() => load().catch(() => (error.value = 'La liste des membres n’a pas pu être chargée.')))

/** Une action à la fois : un double clic n'envoie pas deux requêtes. */
const busy = ref(false)

/** Exécute une action, affiche son erreur éventuelle, puis relit la liste. */
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = notice.value = ''
  link.value = null
  try {
    await action()
    await load()
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}

async function invite(address: string) {
  const res = await api<{ status: 'added' } | { status: 'invited'; token: string }>(
    `${base()}/invitations`,
    { method: 'POST', body: { email: address } },
  )
  if (res.status === 'added') {
    notice.value = `${address} a déjà un compte : il a été ajouté à l’espace.`
  } else {
    link.value = {
      label: `Lien d’invitation pour ${address}`,
      url: linkUrl('invitation', res.token),
    }
  }
}

function submitInvite() {
  const parsed = invitationSchema.safeParse({ email: email.value })
  if (!parsed.success) return void (error.value = 'Saisissez une adresse email valide')
  void run(async () => {
    await invite(parsed.data.email)
    email.value = ''
  })
}

const reset = (member: Members['members'][number]) =>
  run(async () => {
    const res = await api<{ token: string }>(`/users/${member.id}/password-reset`, {
      method: 'POST',
    })
    link.value = {
      label: `Lien de réinitialisation pour ${member.email}`,
      url: linkUrl('reinitialisation', res.token),
    }
  })

const remove = (member: Members['members'][number]) => {
  if (!confirm(`Retirer ${member.email} de l’espace ? Il perdra l’accès immédiatement.`)) return
  return run(async () => {
    await api(`${base()}/members/${member.id}`, { method: 'DELETE' })
    notice.value = `${member.email} a été retiré de l’espace.`
  })
}

const cancel = (invitation: Members['invitations'][number]) =>
  run(async () => {
    await api(`${base()}/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' })
    notice.value = `L’invitation de ${invitation.email} a été annulée.`
  })
</script>

<template>
  <SettingsSection
    id="membres"
    title="Membres"
    description="Les liens ne sont pas envoyés par email : copiez-les et transmettez-les vous-même."
  >
    <form class="flex max-w-md flex-wrap items-end gap-2" novalidate @submit.prevent="submitInvite">
      <div class="grid min-w-56 flex-1 gap-2">
        <Label for="invite-email">Email</Label>
        <Input id="invite-email" v-model="email" type="email" autocomplete="off" />
      </div>
      <Button type="submit" :disabled="busy">Inviter un membre</Button>
    </form>

    <div class="mt-4 grid max-w-2xl grid-cols-1 gap-3">
      <FormError :message="error" />
      <Alert v-if="notice" role="status">
        <AlertDescription>{{ notice }}</AlertDescription>
      </Alert>
      <div v-if="link" class="grid grid-cols-1 gap-2 rounded-lg border p-4">
        <p class="text-sm font-medium">{{ link.label }}</p>
        <CopyField :value="link.url" :label="link.label" />
        <p class="text-sm text-muted-foreground">Ce lien ne fonctionne qu’une fois.</p>
      </div>
    </div>

    <Table v-if="data && (data.members.length || data.invitations.length)" class="mt-6">
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead class="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="member in data.members" :key="member.id">
          <TableCell class="font-medium">{{ member.email }}</TableCell>
          <TableCell>Actif</TableCell>
          <TableCell class="space-x-1 text-right whitespace-nowrap">
            <Button variant="ghost" size="sm" :disabled="busy" @click="reset(member)">
              Lien de réinitialisation
            </Button>
            <Button variant="ghost" size="sm" :disabled="busy" @click="remove(member)"
              >Retirer</Button
            >
          </TableCell>
        </TableRow>
        <TableRow v-for="invitation in data.invitations" :key="invitation.id">
          <TableCell class="font-medium">{{ invitation.email }}</TableCell>
          <TableCell class="text-muted-foreground">
            Invité, jusqu’au {{ expires(invitation.expiresAt) }}
          </TableCell>
          <TableCell class="space-x-1 text-right whitespace-nowrap">
            <Button
              variant="ghost"
              size="sm"
              :disabled="busy"
              @click="run(() => invite(invitation.email))"
            >
              Régénérer le lien
            </Button>
            <Button variant="ghost" size="sm" :disabled="busy" @click="cancel(invitation)"
              >Annuler</Button
            >
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <p v-else-if="data" class="mt-6 text-sm text-muted-foreground">
      Personne d’autre que vous n’a accès à cet espace.
    </p>
  </SettingsSection>
</template>
