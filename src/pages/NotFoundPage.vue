<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="shell shell-center">
    <section class="card card-tight">
      <p class="eyebrow">404</p>
      <h1>Страница не найдена</h1>
      <p>Вернитесь в клиентский интерфейс или откройте админ-панель.</p>
      <div class="row">
        <RouterLink class="btn btn-primary" to="/">Клиент</RouterLink>
        <RouterLink class="btn btn-ghost" to="/admin">Админка</RouterLink>
      </div>
    </section>
  </main>
</template>
