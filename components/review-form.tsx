"use client";

import { useActionState } from "react";
import { MessageSquarePlus, Star } from "lucide-react";
import { submitReviewAction, type ReviewFormState } from "@/actions/reviews";

const initialState: ReviewFormState = {};

export function ReviewForm({ orderId, productId }: { orderId: string; productId: string }) {
  const [state, action, pending] = useActionState(submitReviewAction, initialState);
  if (state.success) return <p className="form-success">{state.success}</p>;
  return <form action={action} className="review-form">
    <input type="hidden" name="orderId" value={orderId}/>
    <input type="hidden" name="productId" value={productId}/>
    <fieldset>
      <legend><Star size={14}/> Votre note</legend>
      <div className="review-rating">
        {[1, 2, 3, 4, 5].map((value) => <label key={value}>
          <input type="radio" name="rating" value={value} required defaultChecked={value === 5}/>
          <span aria-hidden="true">{value}</span>
          <span className="sr-only">{value} sur 5</span>
        </label>)}
      </div>
    </fieldset>
    <label htmlFor={`review-comment-${productId}`}>Votre commentaire (facultatif)</label>
    <textarea id={`review-comment-${productId}`} name="comment" maxLength={1500} rows={3} placeholder="Qualité reçue, conformité, délai de livraison…"/>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button type="submit" className="button button-primary" disabled={pending}>
      <MessageSquarePlus size={15}/>{pending ? "Envoi…" : "Envoyer mon avis"}
    </button>
    <small>Votre avis est réservé à cette commande livrée et sera publié après modération.</small>
  </form>;
}
