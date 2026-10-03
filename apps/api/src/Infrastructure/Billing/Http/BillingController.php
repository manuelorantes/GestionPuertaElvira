<?php

declare(strict_types=1);

namespace App\Infrastructure\Billing\Http;

use App\Application\Billing\AdjustPoints;
use App\Application\Billing\Error\BillingStudentNotFound;
use App\Application\Billing\Error\PaymentNotFound;
use App\Application\Billing\GetStudentAccount;
use App\Application\Billing\IssueInvoice;
use App\Application\Billing\ListMonthlyCharges;
use App\Application\Billing\MarkReminded;
use App\Application\Billing\PaymentRequest;
use App\Application\Billing\Port\BillingQuery;
use App\Application\Billing\Port\BillingSettingsRepository;
use App\Application\Billing\Port\StudentDirectory;
use App\Application\Billing\QuotePayment;
use App\Application\Billing\RegisterPayment;
use App\Application\Billing\SettingsInput;
use App\Application\Billing\UpdateBillingSettings;
use App\Application\Billing\UpdateStudentAccount;
use App\Domain\Billing\PaymentMethod;
use App\Domain\Billing\QuoteLine;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Http\JsonBody;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/billing', name: 'api_admin_billing_', requirements: ['id' => '[0-9a-f-]{36}'])]
#[OA\Tag(name: 'Cobros')]
final readonly class BillingController
{
    public function __construct(private BillingQuery $query, private BillingSettingsRepository $settings)
    {
    }

    #[Route('/charges', name: 'charges', methods: ['GET'])]
    public function charges(Request $request, ListMonthlyCharges $list): JsonResponse
    {
        $month = $request->query->get('month');
        $charges = $list(\is_string($month) ? $month : null);

        return new JsonResponse([
            'month' => $charges->month,
            'label' => ucfirst(YearMonth::fromString($charges->month)->label()),
            'items' => $charges->items,
            'totals' => [
                'expectedCents' => $charges->expectedCents,
                'collectedCents' => $charges->collectedCents,
                'pendingCents' => $charges->expectedCents - $charges->collectedCents,
                'overdueCount' => $charges->overdueCount,
            ],
        ]);
    }

    #[Route('/charges/{id}/reminded', name: 'reminded', methods: ['POST'])]
    public function reminded(string $id, MarkReminded $markReminded): Response
    {
        $markReminded($id);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/quote', name: 'quote', methods: ['POST'])]
    public function quote(Request $request, QuotePayment $quotes): JsonResponse
    {
        $quote = $quotes(self::paymentRequest(JsonBody::from($request)));

        return new JsonResponse([
            'concept' => $quote->concept,
            'periods' => array_map(static fn (YearMonth $p): string => $p->toString(), $quote->periods),
            'lines' => array_map(static fn (QuoteLine $l): array => ['label' => $l->label, 'amountCents' => $l->amount->cents], $quote->quote->lines),
            'grossCents' => $quote->quote->gross->cents,
            'discountPercent' => $quote->quote->discountPercent,
            'totalCents' => $quote->quote->total->cents,
        ]);
    }

    #[Route('/payments', name: 'register', methods: ['POST'])]
    public function register(Request $request, RegisterPayment $register): JsonResponse
    {
        return new JsonResponse(['id' => $register(self::paymentRequest(JsonBody::from($request)))], Response::HTTP_CREATED);
    }

    #[Route('/payments', name: 'payments', methods: ['GET'])]
    public function payments(Request $request): JsonResponse
    {
        $student = $request->query->get('studentId');

        return new JsonResponse(['items' => $this->query->payments(\is_string($student) && '' !== $student ? StudentRef::fromString($student)->value : null)]);
    }

    #[Route('/payments/{id}', name: 'payment', methods: ['GET'])]
    public function payment(string $id): JsonResponse
    {
        $detail = $this->query->payment($id) ?? throw new PaymentNotFound();
        $club = $this->settings->get()->club;

        return new JsonResponse([
            ...get_object_vars($detail->summary),
            'methodLabel' => PaymentMethod::from($detail->summary->method)->label(),
            'guardianName' => $detail->guardianName,
            'lines' => $detail->lines,
            'periods' => $detail->periods,
            'invoice' => $detail->invoice,
            'club' => ['name' => $club->name, 'taxId' => $club->taxId, 'address' => $club->address],
        ]);
    }

    #[Route('/payments/{id}/invoice', name: 'invoice', methods: ['POST'])]
    public function invoice(string $id, Request $request, IssueInvoice $issue): Response
    {
        $body = JsonBody::from($request);
        $issue($id, $body->requiredString('name'), $body->requiredString('taxId'), $body->requiredString('address'));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/accounts/{id}', name: 'account', methods: ['GET'])]
    public function account(string $id, GetStudentAccount $get): JsonResponse
    {
        return new JsonResponse($get($id));
    }

    #[Route('/accounts/{id}', name: 'update_account', methods: ['PUT'])]
    public function updateAccount(string $id, Request $request, UpdateStudentAccount $update, StudentDirectory $directory, Clock $clock): Response
    {
        if (null === $directory->find(StudentRef::fromString($id), LocalDate::fromInstant($clock->now()))) {
            throw new BillingStudentNotFound();
        }
        $body = JsonBody::from($request);
        $update($id, $body->requiredString('preferredPlan'), $body->bool('member'), $body->optionalString('privateRate'));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/accounts/{id}/points', name: 'points', methods: ['POST'])]
    public function points(string $id, Request $request, AdjustPoints $adjust, GetStudentAccount $get): JsonResponse
    {
        $get($id);

        return new JsonResponse(['points' => $adjust($id, JsonBody::from($request)->requiredInt('delta'))]);
    }

    #[Route('/settings', name: 'settings', methods: ['GET'])]
    public function settings(): JsonResponse
    {
        $s = $this->settings->get();
        $t = $s->tariff;
        $decimal = static fn (Money $m): string => number_format($m->cents / 100, 2, '.', '');

        return new JsonResponse([
            'threeHours' => $decimal($t->threeHours),
            'twoHours' => $decimal($t->twoHours),
            'hourAndHalf' => $decimal($t->hourAndHalf),
            'oneHour' => $decimal($t->oneHour),
            'membershipFee' => $decimal($t->membershipFee),
            'familyPercent' => $t->familyPercent,
            'threeMonthsPercent' => $t->threeMonthsPercent,
            'sixMonthsPercent' => $t->sixMonthsPercent,
            'seasonPercent' => $t->seasonPercent,
            'defaultPrivateRate' => $decimal($s->defaultPrivateRate),
            'privateRates' => (object) array_map($decimal, $s->privateRates),
            'clubName' => $s->club->name,
            'clubTaxId' => $s->club->taxId,
            'clubAddress' => $s->club->address,
            'vatPercent' => $s->vatPercent,
        ]);
    }

    #[Route('/settings', name: 'update_settings', methods: ['PUT'])]
    public function updateSettings(Request $request, UpdateBillingSettings $update): Response
    {
        $b = JsonBody::from($request);
        $update(new SettingsInput(
            $b->requiredString('threeHours'),
            $b->requiredString('twoHours'),
            $b->requiredString('hourAndHalf'),
            $b->requiredString('oneHour'),
            $b->requiredString('membershipFee'),
            $b->requiredInt('familyPercent'),
            $b->requiredInt('threeMonthsPercent'),
            $b->requiredInt('sixMonthsPercent'),
            $b->requiredInt('seasonPercent'),
            $b->requiredString('defaultPrivateRate'),
            $b->stringMap('privateRates'),
            $b->requiredString('clubName'),
            $b->requiredString('clubTaxId'),
            $b->requiredString('clubAddress'),
        ));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    private static function paymentRequest(JsonBody $body): PaymentRequest
    {
        $special = $body->optionalObject('specialDiscount');

        return new PaymentRequest(
            $body->requiredString('studentId'),
            $body->optionalString('kind') ?? 'monthly',
            $body->optionalInt('months') ?? 1,
            $body->requiredString('method'),
            $body->requiredString('date'),
            $body->bool('prorate'),
            $special?->requiredInt('percent'),
            $special?->requiredString('concept'),
        );
    }
}
