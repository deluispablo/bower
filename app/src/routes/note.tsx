import { useRoute } from 'preact-iso';

export function Note() {
  const { params } = useRoute();

  return (
    <section>
      <h1>Note</h1>
      <p>Showing note {params.id}.</p>
    </section>
  );
}
