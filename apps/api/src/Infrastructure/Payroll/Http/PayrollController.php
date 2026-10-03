<?php

declare(strict_types=1);

namespace App\Infrastructure\Payroll\Http;

use App\Application\Billing\Port\BillingSettingsRepository;
use App\Application\Payroll\DeleteSession;
use App\Application\Payroll\ListSettlements;
use App\Application\Payroll\MarkHoliday;
use App\Application\Payroll\PayAllSettlements;
use App\Application\Payroll\PaySettlement;
use App\Application\Payroll\Port\PayrollQuery;
use App\Application\Payroll\Profitability;
use App\Application\Payroll\ProposeMonthSessions;
use App\Application\Payroll\RecordSession;
use App\Application\Payroll\SessionInput;
use App\Application\Payroll\SettlementView;
use App\Application\Payroll\UpdateSession;
use App\Domain\Common\Clock;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Http\JsonBody;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/payroll', name: 'api_admin_payroll_', requirements: ['id' => '[0-9a-f-]{36}', 'teacherId' => '[0-9a-f-]{36}', 'month' => '\d{4}-\d{2}'])]
#[OA\Tag(name: 'Profesorado')]
final readonly class PayrollController
{
    public function __construct(private Clock $clock)
    {
    }

    #[Route('/sessions', name: 'sessions', methods: ['GET'])]
    public function sessions(Request $request, ProposeMonthSessions $propose, PayrollQuery $query): JsonResponse
    {
        $month = $this->month($request);
        $propose($month->toString());
        $teacher = $request->query->get('teacherId');

        return new JsonResponse(['month' => $month->toString(), 'items' => $query->sessions($month, \is_string($teacher) && '' !== $teacher ? $teacher : null)]);
    }

    #[Route('/sessions', name: 'record', methods: ['POST'])]
    public function record(Request $request, RecordSession $record): JsonResponse
    {
        $b = JsonBody::from($request);

        return new JsonResponse(['id' => $record(new SessionInput($b->requiredString('teacherId'), $b->requiredString('date'), $b->optionalString('groupId'), $b->optionalString('activity'), self::hours($b)))], Response::HTTP_CREATED);
    }

    #[Route('/sessions/{id}', name: 'update', methods: ['PUT'])]
    public function update(string $id, Request $request, UpdateSession $update): Response
    {
        $b = JsonBody::from($request);
        $update($id, $b->requiredString('teacherId'), self::hours($b));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/sessions/{id}', name: 'delete', methods: ['DELETE'])]
    public function delete(string $id, DeleteSession $delete): Response
    {
        $delete($id);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/holidays', name: 'holiday', methods: ['POST'])]
    public function holiday(Request $request, MarkHoliday $markHoliday): JsonResponse
    {
        return new JsonResponse(['removed' => $markHoliday(JsonBody::from($request)->requiredString('date'))]);
    }

    #[Route('/settlements', name: 'settlements', methods: ['GET'])]
    public function settlements(Request $request, ProposeMonthSessions $propose, ListSettlements $list): JsonResponse
    {
        $month = $this->month($request);
        $propose($month->toString());

        return new JsonResponse(['month' => $month->toString(), 'items' => $list($month->toString())]);
    }

    #[Route('/settlements/{teacherId}/{month}', name: 'settlement', methods: ['GET'])]
    public function settlement(string $teacherId, string $month, ListSettlements $list, BillingSettingsRepository $settings): JsonResponse
    {
        $match = array_values(array_filter($list($month), static fn (SettlementView $s): bool => $s->teacherId === $teacherId))[0]
            ?? throw new NotFoundHttpException();
        $club = $settings->get()->club;

        return new JsonResponse([...get_object_vars($match), 'club' => ['name' => $club->name, 'taxId' => $club->taxId, 'address' => $club->address]]);
    }

    #[Route('/settlements/{teacherId}/{month}/payment', name: 'pay', methods: ['POST'])]
    public function pay(string $teacherId, string $month, Request $request, PaySettlement $pay): Response
    {
        $pay($teacherId, $month, $this->paidOn($request));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/settlements/{month}/payment', name: 'pay_all', methods: ['POST'])]
    public function payAll(string $month, Request $request, PayAllSettlements $payAll): JsonResponse
    {
        return new JsonResponse(['paid' => $payAll($month, $this->paidOn($request))]);
    }

    #[Route('/profitability', name: 'profitability', methods: ['GET'])]
    public function profitability(Request $request, ProposeMonthSessions $propose, Profitability $profitability): JsonResponse
    {
        $month = $this->month($request);
        $propose($month->toString());

        return new JsonResponse(['month' => $month->toString(), 'items' => $profitability($month->toString())]);
    }

    private function month(Request $request): YearMonth
    {
        $month = $request->query->get('month');

        return \is_string($month) && '' !== $month ? YearMonth::fromString($month) : YearMonth::of(LocalDate::fromInstant($this->clock->now()));
    }

    private function paidOn(Request $request): string
    {
        return JsonBody::from($request)->optionalString('date') ?? LocalDate::fromInstant($this->clock->now())->toString();
    }

    private static function hours(JsonBody $body): float
    {
        $hours = $body->optionalNumber('hours') ?? throw new InvalidValue('hours', 'Indica las horas.');

        return $hours;
    }
}
